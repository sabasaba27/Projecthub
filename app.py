from flask import Flask, render_template, session, current_app, request, flash, redirect, url_for
import os
from routes.auth import auth
from routes.user import user_route
from routes.project import project, allowed_file, project_bp
from models import db, Project, User, UserProject
from werkzeug.utils import secure_filename
# Initialize Flask app
app = Flask(__name__)

# Secret key for sessions
app.secret_key = os.urandom(24)

# Database configuration
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///site.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['WTF_CSRF_ENABLED'] = True
UPLOAD_FOLDER = 'static/uploads'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}

# Add the UPLOAD_FOLDER configuration
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Initialize the SQLAlchemy instance
db.init_app(app)


# Initialize the SQLAlchemy instance



# Register Blueprints
app.register_blueprint(auth, url_prefix='/auth')
app.register_blueprint(user_route, url_prefix='/user')
app.register_blueprint(project, url_prefix='/project')
app.register_blueprint(project_bp, url_prefix='/project')





# Function to initialize the database
def init_db(app):
    with app.app_context():
        # Create tables if they don't exist
        db.create_all()


# Initialize the database
init_db(app)



# Routes
@app.route('/')
def home():
    return render_template('index.html')

@app.route('/contact')
def contact():
    return render_template('contact.html')

@app.route('/ivy_league')
def ivy_league():
    return render_template('ivy_league.html')
@app.route('/browse')
def browse_project():
    users = {user.id: user for user in User.query.all()}  # Create a dictionary with user.id as the key
    projects = Project.query.all()

    return render_template('page2.html', projects=projects, users=users)


@app.route('/upload', methods=['GET', 'POST'])
def upload():
    if 'user' not in session or session['role'] != 'organizer':
        return "Access denied. Only organizers can upload projects.", 403

    if request.method == 'POST':
        title = request.form['projectTitle']
        description = request.form['projectDescription']
        eligibility = request.form['eligibility']
        fee_str = request.form['fee']
        place = request.form['place']
        date = request.form['date']
        file = request.files['projectImage']

        # Validate fee input
        try:
            fee = float(fee_str)  # Attempt to convert fee to float
        except ValueError:
            flash('Invalid fee value. Please enter a valid number.', 'danger')
            return redirect(url_for('project.upload'))

        if file and allowed_file(file.filename):
            filename = secure_filename(file.filename)
            file.save(os.path.join(current_app.config['UPLOAD_FOLDER'], filename))

            organizer = User.query.filter_by(username=session['user']).first()  # Use lowercase 'user'
            new_project = Project(
                title=title,
                description=description,
                organizer_id=organizer.id,
                eligibility=eligibility,
                fee=fee,
                place=place,
                date=date,
                image=filename
            )
            try:
                db.session.add(new_project)
                db.session.commit()
                flash('Project uploaded successfully!', 'success')
                return redirect(url_for('/browse'))
            except Exception as e:
                db.session.rollback()
                flash('An error occurred while uploading the project. Please try again.', 'danger')
                print(e)  # Log the error for debugging

        else:
            flash('Invalid file type. Only PNG, JPG, JPEG, and GIF are allowed.', 'danger')

    return render_template('upload.html')
# routes/project.py
from flask import Blueprint, render_template
from models import Project

project = Blueprint('project', __name__)


@app.route('/remove_project/<int:project_id>', methods=['POST'])
def remove_project(project_id):
    try:
        # Find the project by its ID
        project = UserProject.query.get(project_id)

        if project:
            # If the project is found, delete it
            print(f"Project {project_id} found and deleting...")
            db.session.delete(project)
            db.session.commit()
            flash('Project successfully removed.', 'success')
        else:
            print(f"Project {project_id} not found.")
            flash('Project not found.', 'danger')

    except Exception as e:
        # Print any error for debugging purposes
        print(f"Error occurred: {e}")
        flash('An error occurred while trying to remove the project.', 'danger')

    # Redirect back to the user's profile page
    return redirect(url_for('user.profile'))



@app.route('/project/<int:project_id>')
def project_details(project_id):
    project = Project.query.get_or_404(project_id)  # Get the project by ID
    return render_template('project_details.html', project=project)



if __name__ == '__main__':
    app.run(debug=True)
